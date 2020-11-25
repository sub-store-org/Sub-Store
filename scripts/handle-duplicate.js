function operator(proxies) {
  const counter = {};
  const increment = {};
  proxies.forEach((p) => {
    if (typeof counter[p.name] === 'undefined') counter[p.name] = 1;
    else counter[p.name]++;
  });
  return proxies.map((p) => {
    if (counter[p.name] > 1) {
      if (typeof increment[p.name] === "undefined") increment[p.name] = 1;
      const num = "00000" + increment[p.name]++;
      p.name = p.name + " " + num.substr(num.length - 2);
    } 
    return p;
  });
}
