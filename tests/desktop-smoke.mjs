import { _electron as electron, expect } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const profile=mkdtempSync(join(tmpdir(),'qube-smoke-'));
const runtime=process.env.QUBE_ELECTRON_BINARY;
let app;
try {
 app=await electron.launch({...(runtime?{executablePath:runtime}:{}),args:[resolve('apps/windows')],env:{...process.env,QUBE_USER_DATA:profile},timeout:60000});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page.locator('#heading')).toHaveText('你的桌面，多了一个伙伴。');
 await page.locator('[data-tab="coding"]').click();await expect(page.locator('#submit-draft')).toBeDisabled();
 await page.locator('[data-tab="settings"]').click();await expect(page.locator('#config')).toHaveValue(/pythonPath/);
 await page.locator('[data-tab="pairing"]').click();await expect(page.locator('#pairings img').first()).toBeVisible();
 await page.locator('[data-tab="home"]').click();
 await page.locator('#command').fill('明天下午三点提醒我开会');await page.locator('#command-form button').click();
 await expect(page.locator('#toast')).toContainText('连接手机');
 mkdirSync('docs/screenshots',{recursive:true});
 await page.screenshot({path:'docs/screenshots/desktop.png',fullPage:true});
 expect(errors).toEqual([]);console.log('Desktop smoke passed: navigation, pairing QR, disabled submission, offline reminder failure, no renderer errors');
} finally {if(app)await app.close();rmSync(profile,{recursive:true,force:true});}
