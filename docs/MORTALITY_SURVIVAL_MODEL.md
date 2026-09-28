# Aquaculture Mortality & Survival Analytics Model

## Scientific Rationale
Fish spawn mortality rates vary significantly depending on transportation duration, oxygen depletion, physical stress, and initial pond water acclimation.

## Transit & Stocking Scenarios

### 1. Short Transportation (1 to 4 Hours)
- **Mortality Rate**: $2\%$
- **Net Survival**: $\text{Total} \times 0.98$
- **Loss**: $\text{Total} \times 0.02$

### 2. Long Transportation (12 to 24 Hours)
- **Mortality Rate**: $10\%$
- **Net Survival**: $\text{Total} \times 0.90$
- **Loss**: $\text{Total} \times 0.10$

### 3. Pond Stocking / Nursery Transfer
- **Mortality Rate**: $70\%$
- **Net Survival**: $\text{Total} \times 0.30$
- **Loss**: $\text{Total} \times 0.70$