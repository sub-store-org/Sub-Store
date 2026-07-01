export default async function handler(req, res) {
  try {
    const response = await fetch('https://raw.githubusercontent.com/kort0881/vpn-vless-configs-russia/main/githubmirror/clean/vless.txt');
    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch keys' });
  }
}
