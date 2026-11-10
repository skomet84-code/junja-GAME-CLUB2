'use strict';
const TIERS=Object.freeze([{score:80000,prize:50000000},{score:60000,prize:30000000},{score:40000,prize:10000000},{score:20000,prize:3000000},{score:10000,prize:1000000}]);
function prizeFor(score){const n=Number(score);if(!Number.isSafeInteger(n)||n<0)return 0;return TIERS.find(x=>n>=x.score)?.prize||0}
function plausible(score,elapsedMs){return Number.isSafeInteger(score)&&score>=0&&elapsedMs>=35000&&elapsedMs<=1800000&&score<=Math.floor(elapsedMs/1000)*2500+40000}
module.exports={TIERS,prizeFor,plausible};
