import React, { useEffect, useState } from 'react';
import { fetchUploadedImage, getPrivateImagePath } from '../api/client';

export default function AuthenticatedImage({ src, fallbackSrc, alt, ...props }) {
  const privatePath = getPrivateImagePath(src);
  const [resolved, setResolved] = useState({ source: null, url: null });

  useEffect(() => {
    if (!privatePath) return;
    const controller = new AbortController();
    let active = true;
    let objectUrl;

    fetchUploadedImage(privatePath, { signal: controller.signal })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved({ source: src, url: objectUrl });
      })
      .catch(() => {
        if (active) setResolved({ source: src, url: fallbackSrc });
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [privatePath, src, fallbackSrc]);

  const imageSource = privatePath
    ? (resolved.source === src ? resolved.url : fallbackSrc)
    : (src || fallbackSrc);

  return <img {...props} src={imageSource || undefined} alt={alt} />;
}
