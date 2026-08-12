# Fish Spawn Dataset Preparation & Annotation Guidelines

## Capture Standards
- **Container**: White flat-bottom acrylic dish or transparent sampling basin.
- **Lighting**: Diffuse top-down white LED illumination (5000K-6500K) to eliminate harsh surface reflections.
- **Water Depth**: 5mm to 10mm maximum to keep spawn in a single focal plane.
- **Resolution**: Minimum 1280x720 pixels; optimal 1920x1080 pixels at 300+ DPI equivalent.
## Augmentation Pipeline
- Random Horizontal & Vertical Flips ($p = 0.5$)
- Random Rotation (0 to 360 degrees)
- Contrast-Limited Adaptive Histogram Equalization (CLAHE)
- Gaussian Blur & Noise Injection for lens artifact simulation
- Random Scale & Crop ($0.8 \times$ to $1.2 \times$)
