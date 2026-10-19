import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,seedReference} from '../src/db.js';
import {Auth} from '../src/auth.js';

test('Public copy: no administrator or presenter enabled without local passwords',()=>{
 const previousAdmin=process.env.CH8_ADMIN_PASSWORD,previousPresenter=process.env.CH8_PRESENTER_PASSWORD;
 delete process.env.CH8_ADMIN_PASSWORD;delete process.env.CH8_PRESENTER_PASSWORD;
 const db=openDatabase(':memory:');
 try {
  seedReference(db);new Auth(db);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM manager_accounts WHERE enabled=1').get() as {n:number}).n,0);
 } finally {
  db.close();
  if(previousAdmin===undefined)delete process.env.CH8_ADMIN_PASSWORD;else process.env.CH8_ADMIN_PASSWORD=previousAdmin;
  if(previousPresenter===undefined)delete process.env.CH8_PRESENTER_PASSWORD;else process.env.CH8_PRESENTER_PASSWORD=previousPresenter;
 }
});
