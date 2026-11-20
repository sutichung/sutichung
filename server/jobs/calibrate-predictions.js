'use strict';
const {createPredictionJournal}=require('../lib/prediction-journal');
async function main(){
 const journal=createPredictionJournal();
 const report=await journal.calibrateAll({minimumSamples:Number(process.env.MODEL_CALIBRATION_MIN_SAMPLES||30)});
 process.stdout.write(JSON.stringify(report));
 if(report.results.some(x=>!x.eligible))process.exitCode=0; // Ineligible is a valid no-training state, not a failed run.
}
if(require.main===module)main().catch(e=>{process.stderr.write(e.stack||String(e));process.exit(1);});
module.exports={main};
