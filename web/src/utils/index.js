import Axios from 'axios';
export const axios = Axios.create({
    // baseURL: 'http://sub.store/api',
    baseURL: 'http://127.0.0.1:3000/api',
    timeout: 1000
});

export function isEmptyObj(obj) {
    return Object.keys(obj).length === 0;
}