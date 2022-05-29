const DEBUG = process.env.NODE_ENV === 'development';
const domain = process.env.DOMIAN || 'https://sub.store';

let savedDomain = localStorage.getItem('domain')

const searchParams = new URLSearchParams(window.location.search)

const newDomain = searchParams.get('domain')

if (savedDomain !== newDomain) {
    console.log(`newDomain: ${newDomain}`)
    localStorage.setItem('domain', newDomain)
    savedDomain = newDomain
}

export const BACKEND_BASE = savedDomain || (DEBUG ? `http://localhost:3000` : domain);
// export const BACKEND_BASE = DEBUG ? `https://sub.store:9999` : `https://sub.store`;
