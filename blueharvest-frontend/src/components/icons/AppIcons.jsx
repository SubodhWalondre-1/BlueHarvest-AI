import React from 'react';

// Authentic Fish icon matching insightsReference.png
export const FishIcon = ({ size = 20, color = "#1D70F7" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <path d="M2.5 12C5.5 8 11.5 7 16.5 9.8L21.5 6.5V17.5L16.5 14.2C11.5 17 5.5 16 2.5 12Z" />
    <circle cx="6.5" cy="11.2" r="1.3" fill="#FFFFFF" />
  </svg>
);

// Authentic Counting Sessions stacked discs icon matching insightsReference.png
export const CountingSessionsIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <ellipse cx="12" cy="6.5" rx="7.5" ry="2.8" fill="#10B981" />
    <path d="M4.5 10.5C4.5 12 7.8 13.3 12 13.3C16.2 13.3 19.5 12 19.5 10.5" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M4.5 15.5C4.5 17 7.8 18.3 12 18.3C16.2 18.3 19.5 17 19.5 15.5" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

// Authentic blue circular basin / tank tub icon matching historySectionReference.png
export const BasinIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <ellipse cx="12" cy="7.5" rx="8.5" ry="3.5" fill="#3B82F6" />
    <path d="M3.5 7.5v7.2c0 2.2 3.8 3.8 8.5 3.8s8.5-1.6 8.5-3.8V7.5" fill="#2563EB" />
    <ellipse cx="12" cy="7.5" rx="6.8" ry="2.2" fill="#93C5FD" />
  </svg>
);

// Indian Rupee currency icon
export const IndianRupeeIcon = ({ size = 13, color = "currentColor" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2.4" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ flexShrink: 0 }}
  >
    <path d="M6 3h12" />
    <path d="M6 8h12" />
    <path d="M6 13l8.5 8" />
    <path d="M6 13h3a4.5 4.5 0 0 0 0-9" />
  </svg>
);

// Solid left-facing fish silhouette matching outputCardReference.png
export const OutputCardFishIcon = ({ size = 26, color = "#1D4ED8" }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M4 14C6.5 11.2 10.2 9.5 14.5 9.5C16.8 9.5 18.8 8.2 19.8 7C20.2 8.5 20.5 10.2 20.5 12C21.8 11 23.5 9.8 25.5 9L24.2 14L25.5 19C23.5 18.2 21.8 17 20.5 16C20.5 17.8 20.2 19.5 19.8 21C18.8 19.8 16.8 18.5 14.5 18.5C10.2 18.5 6.5 16.8 4 14Z" 
      fill={color} 
    />
    <circle cx="8.5" cy="13.2" r="1.3" fill="#FFFFFF" />
  </svg>
);
