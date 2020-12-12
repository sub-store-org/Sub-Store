<h1 align="center">
  <img src="https://raw.githubusercontent.com/58xinian/icon/master/Sub-Store1.png" alt="Sub-Store" width="200">
  <br>Sub-Store<br>
</h1>

<h4 align="center">Advanced Subscription Manager for QX, Loon, Surge and Clash</h4>

[![Docs](https://readthedocs.org/projects/yt2mp3/badge/?version=latest)](https://www.notion.so/Sub-Store-6259586994d34c11a4ced5c406264b46)
[![Issues](https://img.shields.io/github/issues-raw/Peng-YM/Sub-Store.svg?maxAge=25000)](https://github.com/Peng-YM/Sub-Store/issues)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store?ref=badge_shield)
[![GPLv3 License](https://img.shields.io/badge/License-GPL%20v3-yellow.svg)](https://opensource.org/licenses/)

Core functionalities:
1. Conversion among various formats.
2. Subscription formatting.
3. Collect multiple subscriptions in one URL.
## 1. Subscription Conversion

### Supported Input Formats
- [x] SS URI
- [x] SSR URI
- [x] SSD URI
- [x] V2RayN URI
- [x] QX (SS, SSR, VMess, Trojan, HTTP)
- [x] Loon (SS, SSR, VMess, Trojan, HTTP)
- [x] Surge (SS, VMess, Trojan, HTTP)
- [x] Clash (SS, SSR, VMess, Trojan, HTTP)

### Supported Target Platforms
- [x] QX
- [x] Loon
- [x] Surge

## 2. Subscription Formatting
### Filtering
- [x] **Keyword filter**
- [x] **Discard keywords filter**
- [x] **Regex filter**
- [x] **Discard regex filter**
- [x] **Region filter**
- [x] **Type filter**
- [x] **Useless proxies filter**
- [x] **Script filter**

### Proxy Operations
- [x] **Set property operator**: set some proxy properties such as `udp`,`tfo`, `skip-cert-verify` etc.
- [x] **Flag operator**: add flags or remove flags for proxies.
- [x] **Sort operator**: sort proxies by name.
- [x] **Keyword sort operator**: sort proxies by keywords (fallback to normal sort).
- [x] **Keyword rename operator**: replace by keywords in proxy names.
- [x] **Keyword delete operator**: delete by keywords in proxy names.
- [x] **Regex rename operator**: replace by regex in proxy names.
- [x] **Regex delete operator**: delete by regex in proxy names.
- [x] **Script operator**: modify proxy by script.

### Development
Go to `backend` and `web` directories, install node dependencies:
```
npm install
```

1. In `backend`, run the backend server on http://localhost:3000

```
node sub-store.js
```

2. In`web`, start the vue-cli server
```
npm start
```

## LICENSE
This project is under the GPL V3 LICENSE.


[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store?ref=badge_large)

## Acknowledgements
- Special thanks to @KOP-XIAO for his awesome resource-parser. Please give a [star](https://github.com/KOP-XIAO/QuantumultX) for his great work!
- Speicial thanks to @Orz-3 and @58xinian for their awesome icons.
