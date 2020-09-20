function operator(proxies) {
    const counter = {};
    return proxies.map(p => {
      if (!counter[p.name]) counter[p.name] = 0;
      const num = "00000" + counter[p.name];
      ++counter[p.name];
      p.name = p.name + " " + num.substr(num.length-2);
      return p;
    });
}