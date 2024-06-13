import rs from 'jsrsasign';

export function generateFingerprint(caStr) {
    const hex = rs.pemtohex(caStr);
    const fingerPrint = rs.KJUR.crypto.Util.hashHex(hex, 'sha256');
    return fingerPrint.match(/.{2}/g).join(':').toUpperCase();
}

export default {
    generateFingerprint,
};
