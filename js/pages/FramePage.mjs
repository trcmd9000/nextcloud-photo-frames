import {
  html,
  useEffect,
  useRef,
  useState,
} from "../vendor/htm-preact-standalone.min.mjs";
import { injectGlobal } from "../vendor/emotion-css.min.mjs";
import Frame from "../components/Frame.mjs";
import EmptyAlbum from "../components/EmptyAlbum.mjs";
import PhotoCouldNotBeLoaded from "../components/PhotoCouldNotBeLoaded.mjs";
import dispatch from "../utils/dispatch.mjs";
import timedFetch from "../utils/timedFetch.mjs";

const rotationUnitRefreshInterval = {
  day: 1000 * 60, // One minute
  hour: 1000 * 60, // One minute
  minute: 1000, // One second
};

injectGlobal`
  :root {
    font-size: 16px;
  }
  body {
    margin: 0;
  }
`;

async function responseToBlobUrl(imageResponse) {
  // Create a blob URL for the image. Blob URLs are unique per image,
  // so the browser cannot show a previously cached image URL
  const blob = await imageResponse.blob();

  dispatch("pf:image-loadstart", { blob });

  const blobUrl = URL.createObjectURL(blob);

  dispatch("pf:image-loadend", { blob });
  return blobUrl;
}

let nextTimeoutAt = Date.now();
const getNextTimeoutDelay = (currentImage) => {
  if (!currentImage) return 0;

  while (nextTimeoutAt <= Date.now()) {
    nextTimeoutAt += currentImage.refreshInterval;
  }

  return nextTimeoutAt - Date.now();
};

class AlbumEmptyError extends Error {}
class UpdateImageError extends Error {}

export default function FramePage(props) {
  const {
    showPhotoTimestamp,
    showPhotoPlace,
    showClock,
    clockStyle,
    clockSize,
    photoSize,
    backgroundType,
    backgroundColor,
    imageUrl,
  } = props;
  const [images, setImages] = useState([]);
  const [albumIsEmpty, setAlbumIsEmpty] = useState(false);
  const [error, setError] = useState(false);
  const imageRef = useRef(null);

  useEffect(() => {
    let loopTimeout;

    // Fetch the image in screen size (including device pixel ratio)
    const sizedImageUrl = new URL(imageUrl, location.origin);
    sizedImageUrl.searchParams.set(
      "w",
      Math.round(screen.width * (window.devicePixelRatio || 1)),
    );
    sizedImageUrl.searchParams.set(
      "h",
      Math.round(screen.height * (window.devicePixelRatio || 1)),
    );

    const updateImage = async () => {
      if (imageRef.current) {
        // Fetch the newest image's expiry, continue if the expiry is
        // not the same as the current image (e.g. it really IS a new image)
        const headResponse = await timedFetch(10000, imageUrl, {
          method: "HEAD",
          cache: "reload",
        });
        const nextExpiresAt = new Date(headResponse.headers.get("expires"));
        if (imageRef.current.expiresAt >= nextExpiresAt) return;
      }

      const imageResponse = await timedFetch(10000, sizedImageUrl);

      // If image returns a 404, it means the albums has no images
      if (imageResponse.status === 404) throw new AlbumEmptyError();

      // Only continue if the response is ok
      if (!imageResponse.ok) throw new UpdateImageError();

      const blobUrl = await responseToBlobUrl(imageResponse);

      // Prepare next image
      const rotationUnit = imageResponse.headers.get("X-Frame-Rotation-Unit");
      const nextImage = {
        url: blobUrl,
        expiresAt: new Date(imageResponse.headers.get("expires")),
        place: decodeURIComponent(imageResponse.headers.get("X-Photo-Place")),
        timestamp: new Date(
          imageResponse.headers.get("X-Photo-Timestamp") * 1000,
        ),
        refreshInterval: rotationUnitRefreshInterval[rotationUnit],
      };
      const previousImage = imageRef.current;
      imageRef.current = nextImage;

      setImages((images) => [images.at(0), nextImage].filter(Boolean));

      // Remove previous image when the new image has faded in
      if (imageRef.current) {
        dispatch("pf:image-fadestart", { image: nextImage });
        await new Promise((resolve) => {
          setTimeout(() => {
            setImages([nextImage]);
            if (previousImage) URL.revokeObjectURL(previousImage.url);
            dispatch("pf:image-visible", { image: nextImage });
            resolve();
          }, 2000);
        });
      } else {
        dispatch("pf:image-visible", { image: nextImage });
        dispatch("pf:frame-ready", { image: nextImage });
      }
    };

    const loop = async function () {
      try {
        // Update image if expired
        if (Date.now() > imageRef.current.expiresAt) await updateImage();
      } finally {
        // Always schedule new loop
        loopTimeout = setTimeout(loop, getNextTimeoutDelay(imageRef.current));
      }
    };

    // Do initial image update
    updateImage()
      .then(() => {
        // If successful, start update loop
        loopTimeout = setTimeout(loop, getNextTimeoutDelay());
      })
      .catch((e) => {
        // If not successful, show empty or error state
        if (e instanceof AlbumEmptyError) {
          setAlbumIsEmpty(true);
          dispatch("pf:frame-ready", { image: null });
        }
        setError(true);
      });

    return () => {
      clearTimeout(loopTimeout);
      // The current blob URL can no longer be shown, release it
      if (imageRef.current) URL.revokeObjectURL(imageRef.current.url);
    };
  }, []);

  if (albumIsEmpty) {
    return html` <${EmptyAlbum} /> `;
  }

  if (error) {
    return html` <${PhotoCouldNotBeLoaded} /> `;
  }

  return html`
    ${images.map(
      (image) =>
        html`<${Frame}
          key=${image.expiresAt}
          showPhotoTimestamp=${showPhotoTimestamp}
          showPhotoPlace=${showPhotoPlace}
          showClock=${showClock}
          clockStyle=${clockStyle}
          clockSize=${clockSize}
          photoSize=${photoSize}
          backgroundType=${backgroundType}
          backgroundColor=${backgroundColor}
          image=${image}
        />`,
    )}
  `;
}
