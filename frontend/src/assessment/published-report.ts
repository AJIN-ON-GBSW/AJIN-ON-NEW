// Transcription of the dated assessment reports on slide 23 of the supplied 2026-11-18 planning deck.
// Group figures are published aggregates. They are not per-plant measurements.
import type {Metrics} from './report';

const scores2026: [string,number,number,number,number][] = [
  ['모화',20.98,18.84,1.88,.26],['구어',20.09,18.63,1.12,.34],['본사',20,18.15,1.45,.4],
  ['건천',19.98,18.39,1.1,.49],['경산',19.8,18.09,1.45,.26],['입실',18.83,17.49,1.05,.29],
  ['아진전자부품',18.43,17.19,1.03,.21],['우신',17.47,16.59,.66,.22],['AJ아진',16.69,15.81,.63,.25],['준텍',16.32,15.9,.32,.1],
];
const scores2025: [string,number][] = [
  ['본사',20.34],['구어',19.39],['모화',19.30],['경산',18.61],['우신',18.51],['입실',18.48],['건천',17.69],['아진전자부품',17.25],['AJ아진',16.81],['준텍',14.81],
];
export const publishedScores:Record<string,Metrics> = {
  '2026-1': Object.fromEntries(scores2026.map(([plant,score,site,practiceBonus,improvementBonus])=>[plant,{score,site,practiceBonus,improvementBonus}])),
  '2025-2': Object.fromEntries(scores2025.map(([plant,score])=>[plant,{score}])),
};
export const publishedFactors:Record<string,[number,number]>={career:[2.2,.6],practice:[76,44]};
export const publishedAreas:Record<string,[number,number]>={'1':[63,5.5],'2':[57.2,7.2],'3':[61.4,6.4],'4':[54.8,5.5],'5':[61.1,11.8]};
