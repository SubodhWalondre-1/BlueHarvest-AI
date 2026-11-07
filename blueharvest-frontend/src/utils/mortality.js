// Calculate spawn mortality and net survival estimates based on total spawn count
export const calculateMortalityAnalysis = (count) => {
  const total = Math.max(0, Number(count) || 0);

  // 1 to 4 hr transportation: 2% mortality
  const loss1to4 = Math.round(total * 0.02);
  const surviving1to4 = Math.max(0, total - loss1to4);

  // 12 to 24 hr transportation: 10% mortality
  const loss12to24 = Math.round(total * 0.10);
  const surviving12to24 = Math.max(0, total - loss12to24);

  // After putting spawn in pond: 70% mortality
  const lossPond = Math.round(total * 0.70);
  const survivingPond = Math.max(0, total - lossPond);

  return {
    total,
    t1to4: {
      label: '1 to 4 hr Transportation',
      mortalityRate: '2%',
      loss: loss1to4,
      surviving: surviving1to4,
      percentSurviving: '98%',
    },
    t12to24: {
      label: '12 to 24 hr Transportation',
      mortalityRate: '10%',
      loss: loss12to24,
      surviving: surviving12to24,
      percentSurviving: '90%',
    },
    pond70: {
      label: 'Pond Stocking (After Spawn)',
      mortalityRate: '70%',
      loss: lossPond,
      surviving: survivingPond,
      percentSurviving: '30%',
    },
  };
};
