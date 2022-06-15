import loon from './core/proxy-utils/grammars/loon';
import * as peggy from 'peggy';

const parser = peggy.generate(loon);

const raw = String.raw`vmess4 = vmess,example.com,10086,aes-128-gcm,"52396e06-041a-4cc2-be5c-8525eb457809",transport=ws,alterId=0,path=/,host=v3-dy-y.ixigua.com,over-tls=true,tls-name=example.com,skip-cert-verify=true`;

console.log(JSON.stringify(parser.parse(raw), null, 2));
