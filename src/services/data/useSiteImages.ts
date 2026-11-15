/** Lander photos (illustrative). Missing file -> empty map; the app then keeps
 *  the plain category markers and shows no photo. */

import { useEffect, useState } from "react";
import { loadSiteImages } from "./loaders";
import type { SiteImage } from "../../types";

export function useSiteImages(): Record<string, SiteImage> {
  const [images, setImages] = useState<Record<string, SiteImage>>({});
  useEffect(() => {
    loadSiteImages().then((d) => setImages(d.images)).catch(() => undefined);
  }, []);
  return images;
}
