import { useState, useRef, useEffect } from "react";
import { getPlaceholderImage } from "../utils/helpers";

const LazyImage = ({
  src,
  alt,
  className,
  onError,
  placeholderWidth = 200,
  placeholderHeight = 200,
  placeholderText,
  fallbackImage,
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "50px", // Start loading 50px before the image enters viewport
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
      observer.disconnect();
    };
  }, [src]);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = (e) => {
    // If we haven't tried a fallback yet, use the provided fallbackImage or the default placeholder
    if (!fallbackSrc) {
      const placeholder = fallbackImage || getPlaceholderImage(
        placeholderWidth,
        placeholderHeight,
        placeholderText || alt || "Image"
      );
      setFallbackSrc(placeholder);
      setImageSrc(placeholder);
      setHasError(false);
      setIsLoaded(false);
      return;
    }

    // If fallback also failed, show error state
    setHasError(true);
    setIsLoaded(false);
    if (onError) {
      onError(e);
    }
  };

  return (
    <div className={`relative overflow-hidden ${className || ""}`} ref={imgRef}>
      {/* Placeholder/Blur effect */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse"></div>
      )}

      {/* Actual Image */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={alt}
          className={`transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          } ${className || ""}`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          {...props}
        />
      )}

      {/* Error Fallback - Only show if both original and placeholder failed */}
      {hasError && fallbackSrc && (
        <div className="absolute inset-0 bg-gray-200 flex items-center justify-center">
          <span className="text-gray-400 text-xs">Failed to load</span>
        </div>
      )}
    </div>
  );
};

export default LazyImage;
