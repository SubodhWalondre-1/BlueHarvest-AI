# P2PNet Point-to-Point Counting Network

## Model Overview
P2PNet frames dense micro-object counting as direct point coordinates prediction without requiring intermediate density maps or bounding box anchors.

## Loss Formulation
- **Hungarian Matcher**: One-to-one optimal bipartite matching between predicted points and ground-truth coordinates.
- **Point Coordinate Loss**: Smooth L1 loss measuring spatial discrepancy:
  $$\mathcal{L}_{coord} = \sum_{i} \text{SmoothL1}(p_i - \hat{p}_{\sigma(i)})$$
- **Classification Loss**: Cross-entropy measuring foreground confidence.
## Feature Extractor Backbones
- **VGG-16 with FPN**: Deep multi-scale feature pyramids capturing both microscopic fry outlines and dense clusters.
- **Inference Complexity**: $\sim 35\text{ms}$ per $1080\text{p}$ image on NVIDIA RTX 3060; $\sim 320\text{ms}$ on modern 8-core CPU.
