import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
        }}
      >
        {/* Graduation cap shape */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon points="50,20 12,38 50,56 88,38" fill="white" fillOpacity="0.95" />
          <polygon points="50,56 50,72 12,56 12,38 50,56" fill="white" fillOpacity="0.75" />
          <polygon points="50,56 50,72 88,56 88,38 50,56" fill="white" fillOpacity="0.85" />
          {/* Connection dots */}
          <circle cx="32" cy="78" r="4" fill="white" fillOpacity="0.9" />
          <circle cx="50" cy="82" r="4" fill="white" fillOpacity="0.9" />
          <circle cx="68" cy="78" r="4" fill="white" fillOpacity="0.9" />
          <line x1="32" y1="78" x2="50" y2="82" stroke="white" strokeOpacity="0.6" strokeWidth="2" />
          <line x1="50" y1="82" x2="68" y2="78" stroke="white" strokeOpacity="0.6" strokeWidth="2" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
