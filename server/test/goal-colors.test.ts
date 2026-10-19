import {test} from 'node:test';
import assert from 'node:assert/strict';
import {goalProgressColor} from '../../client/src/publicData.js';
import {performance} from '../src/field-calibration.js';
test('1A et 1D : 81,8 % de l’objectif est vert, le rendement de 51,22 % reste rouge',()=>{
 const total=179904,seconds=7*3600+48*60+21,c={nominal_bph:45000,yellow:.6,green:.75,blue:.9};
 const yieldBefore=performance(total,seconds,c);
 assert.equal(goalProgressColor(total/220000),'green');assert.equal(yieldBefore.percent,51.22);assert.equal(yieldBefore.color,'red');
 // Changing the goal changes 1A, without improving the capacity-based performance in 1D.
 assert.equal(goalProgressColor(total/150000),'blue');assert.deepEqual(performance(total,seconds,c),yieldBefore);
});
test('1A : seuils de progression 50 / 70 / 85 %, zéro et dépassement',()=>{
 assert.deepEqual([0,.4999,.5,.6999,.7,.8499,.85,1,1.2].map(goalProgressColor),['red','red','orange','orange','green','green','blue','blue','blue']);
 assert.equal(goalProgressColor(NaN),'unknown');
});
