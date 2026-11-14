/** Minimal BigTIFF/COG reader for the PGDA LOLA products (and similar files):
 *  little-endian BigTIFF, tiled, DEFLATE (compression 8), horizontal-byte /
 *  floating-point predictors (1, 2 or 3), float32 or uint8 samples.
 *  Supports local files and HTTP range reads. Scope is deliberately narrow;
 *  format details were verified against the live files on 2026-11-13
 *  (see docs/data-provenance.md). */

import { inflateSync } from "node:zlib";
import { open as fsOpen } from "node:fs/promises";

export interface RangeSource {
  size(): Promise<number>;
  read(offset: number, length: number): Promise<Buffer>;
  describe(): string;
  close(): Promise<void>;
}

export async function fileSource(path: string): Promise<RangeSource> {
  const fh = await fsOpen(path, "r");
  const st = await fh.stat();
  return {
    size: async () => st.size,
    read: async (offset, length) => {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return buf.subarray(0, bytesRead);
    },
    describe: () => path,
    close: () => fh.close(),
  };
}

export function httpSource(url: string): RangeSource {
  let sizeCache: number | null = null;
  return {
    async size() {
      if (sizeCache !== null) return sizeCache;
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) throw new Error(`HEAD ${url} -> ${res.status}`);
      sizeCache = Number(res.headers.get("content-length"));
      return sizeCache;
    },
    async read(offset, length) {
      const res = await fetch(url, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      });
      if (res.status !== 206 && res.status !== 200) {
        throw new Error(`GET ${url} range ${offset}+${length} -> ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    },
    describe: () => url,
    close: async () => {},
  };
}

export interface TiffInfo {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesAcross: number;
  tilesDown: number;
  bitsPerSample: number;
  sampleFormat: number; // 3 = IEEE float, 1 = unsigned int
  compression: number; // 8 = deflate
  predictor: number; // 1 none, 2 horizontal, 3 floating-point
  tileOffsets: number[];
  tileByteCounts: number[];
  /** ModelPixelScale (sx, sy) in metres/pixel. */
  pixelScale: [number, number];
  /** Model coordinates of the top-left corner of pixel (0,0): [X0, Y0]. */
  tiepoint: [number, number];
  noDataNaN: boolean;
}

const TYPE_SIZE: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 11: 4, 12: 8, 16: 8, 17: 8,
};

export class CogReader {
  private tileCache = new Map<number, Float32Array | Uint8Array>();
  private constructor(
    public src: RangeSource,
    public info: TiffInfo,
    private rawTileProvider?: (idx: number) => Promise<Buffer | null>,
  ) {}

  /** Parse the primary IFD. headerBytes must cover the IFD and its arrays
   *  (4 MB is ample for these files); out-of-range pointers are fetched. */
  static async open(
    src: RangeSource,
    opts: { rawTileProvider?: (idx: number) => Promise<Buffer | null> } = {},
  ): Promise<CogReader> {
    const head = await src.read(0, 4 * 1024 * 1024);
    if (head.length < 16 || head.toString("latin1", 0, 2) !== "II") {
      throw new Error(`${src.describe()}: not a little-endian TIFF`);
    }
    const magic = head.readUInt16LE(2);
    if (magic !== 43) throw new Error(`${src.describe()}: not BigTIFF (magic ${magic})`);
    const ifdOff = Number(head.readBigUInt64LE(8));

    const readAt = async (off: number, len: number): Promise<Buffer> => {
      if (off + len <= head.length) return head.subarray(off, off + len);
      return src.read(off, len);
    };

    const ifdHead = await readAt(ifdOff, 8);
    const nEntries = Number(ifdHead.readBigUInt64LE(0));
    const entries = await readAt(ifdOff + 8, nEntries * 20);

    const tags = new Map<number, { type: number; count: number; raw: Buffer }>();
    for (let i = 0; i < nEntries; i++) {
      const e = entries.subarray(i * 20, i * 20 + 20);
      const tag = e.readUInt16LE(0);
      const type = e.readUInt16LE(2);
      const count = Number(e.readBigUInt64LE(4));
      const size = (TYPE_SIZE[type] ?? 1) * count;
      let raw: Buffer;
      if (size <= 8) raw = e.subarray(12, 12 + size);
      else raw = await readAt(Number(e.readBigUInt64LE(12)), size);
      tags.set(tag, { type, count, raw });
    }

    const num = (tag: number, dflt?: number): number => {
      const t = tags.get(tag);
      if (!t) {
        if (dflt !== undefined) return dflt;
        throw new Error(`${src.describe()}: missing TIFF tag ${tag}`);
      }
      return readNum(t.raw, 0, t.type);
    };
    const numArr = (tag: number): number[] => {
      const t = tags.get(tag);
      if (!t) throw new Error(`${src.describe()}: missing TIFF tag ${tag}`);
      const sz = TYPE_SIZE[t.type];
      const out = new Array<number>(t.count);
      for (let i = 0; i < t.count; i++) out[i] = readNum(t.raw, i * sz, t.type);
      return out;
    };

    const width = num(256);
    const height = num(257);
    const tileWidth = num(322);
    const tileHeight = num(323);
    const scaleT = tags.get(33550);
    const tieT = tags.get(33922);
    const scale = scaleT ? numArr(33550) : [NaN, NaN];
    const tie = tieT ? numArr(33922) : [0, 0, 0, NaN, NaN, 0];
    const nod = tags.get(42113);
    const info: TiffInfo = {
      width,
      height,
      tileWidth,
      tileHeight,
      tilesAcross: Math.ceil(width / tileWidth),
      tilesDown: Math.ceil(height / tileHeight),
      bitsPerSample: num(258, 32),
      sampleFormat: num(339, 1),
      compression: num(259, 1),
      predictor: num(317, 1),
      tileOffsets: numArr(324),
      tileByteCounts: numArr(325),
      pixelScale: [scale[0], scale[1]],
      tiepoint: [tie[3], tie[4]],
      noDataNaN: nod ? nod.raw.toString("latin1").toLowerCase().startsWith("nan") : false,
    };
    if (info.compression !== 8 && info.compression !== 1) {
      throw new Error(`${src.describe()}: unsupported compression ${info.compression}`);
    }
    return new CogReader(src, info, opts.rawTileProvider);
  }

  bytesPerSample(): number {
    return this.info.bitsPerSample / 8;
  }

  /** Decode one tile; result cached. Returns Float32Array (float data) or
   *  Uint8Array (byte data), length tileWidth*tileHeight. */
  async tile(idx: number): Promise<Float32Array | Uint8Array> {
    const cached = this.tileCache.get(idx);
    if (cached) return cached;
    let raw: Buffer | null = null;
    if (this.rawTileProvider) raw = await this.rawTileProvider(idx);
    if (!raw) {
      raw = await this.src.read(this.info.tileOffsets[idx], this.info.tileByteCounts[idx]);
    }
    const data = this.info.compression === 8 ? inflateSync(raw) : raw;
    const w = this.info.tileWidth;
    const h = this.info.tileHeight;
    const bps = this.bytesPerSample();
    let out: Float32Array | Uint8Array;
    if (bps === 4 && this.info.sampleFormat === 3) {
      const o = new Float32Array(w * h);
      const rowBytes = w * 4;
      const rebuilt = Buffer.alloc(rowBytes);
      for (let r = 0; r < h; r++) {
        const row = data.subarray(r * rowBytes, (r + 1) * rowBytes);
        if (row.length < rowBytes) break; // short last tile region
        if (this.info.predictor === 3) {
          // Undo horizontal byte differencing, then de-interleave byte planes
          // (planes stored most-significant first; samples little-endian).
          let acc = row[0];
          rebuiltPlane[0] = acc;
          for (let i = 1; i < rowBytes; i++) {
            acc = (acc + row[i]) & 0xff;
            rebuiltPlane[i] = acc;
          }
          for (let k = 0; k < w; k++) {
            rebuilt[4 * k] = rebuiltPlane[3 * w + k];
            rebuilt[4 * k + 1] = rebuiltPlane[2 * w + k];
            rebuilt[4 * k + 2] = rebuiltPlane[1 * w + k];
            rebuilt[4 * k + 3] = rebuiltPlane[k];
          }
          for (let k = 0; k < w; k++) o[r * w + k] = rebuilt.readFloatLE(4 * k);
        } else {
          for (let k = 0; k < w; k++) o[r * w + k] = row.readFloatLE(4 * k);
        }
      }
      out = o;
    } else if (bps === 1) {
      const o = new Uint8Array(w * h);
      for (let r = 0; r < h; r++) {
        const row = data.subarray(r * w, (r + 1) * w);
        if (this.info.predictor === 2) {
          let acc = 0;
          for (let i = 0; i < row.length; i++) {
            acc = i === 0 ? row[0] : (acc + row[i]) & 0xff;
            o[r * w + i] = acc;
          }
        } else o.set(row, r * w);
      }
      out = o;
    } else {
      throw new Error(`${this.src.describe()}: unsupported sample layout (${this.info.bitsPerSample}-bit, format ${this.info.sampleFormat})`);
    }
    this.tileCache.set(idx, out);
    return out;
  }

  /** Raw (possibly compressed) bytes of a tile - used for on-disk caching. */
  async rawTile(idx: number): Promise<Buffer> {
    return this.src.read(this.info.tileOffsets[idx], this.info.tileByteCounts[idx]);
  }

  /** Pixel value at (col,row); NaN outside the grid. */
  async pixel(col: number, row: number): Promise<number> {
    const { width, height, tileWidth, tileHeight, tilesAcross } = this.info;
    if (col < 0 || row < 0 || col >= width || row >= height) return NaN;
    const t = await this.tile(Math.floor(row / tileHeight) * tilesAcross + Math.floor(col / tileWidth));
    return t[(row % tileHeight) * tileWidth + (col % tileWidth)];
  }
}

const rebuiltPlane = Buffer.alloc(512 * 4); // scratch for one 512-px float row

function readNum(buf: Buffer, off: number, type: number): number {
  switch (type) {
    case 1: case 7: return buf.readUInt8(off);
    case 3: return buf.readUInt16LE(off);
    case 4: return buf.readUInt32LE(off);
    case 11: return buf.readFloatLE(off);
    case 12: return buf.readDoubleLE(off);
    case 16: return Number(buf.readBigUInt64LE(off));
    case 17: return Number(buf.readBigInt64LE(off));
    default: throw new Error(`Unsupported TIFF type ${type}`);
  }
}
