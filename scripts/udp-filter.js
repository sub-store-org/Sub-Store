/**
 * 过滤 UDP 节点
 */
function filter(proxies) {
  return proxies.map(p => p.udp);
}
