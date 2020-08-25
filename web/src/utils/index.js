import Axios from 'axios';
import {BACKEND_BASE} from "@/config";

export const axios = Axios.create({
    baseURL: `${BACKEND_BASE}/api`,
    timeout: 1000
});

export function isEmptyObj(obj) {
    return Object.keys(obj).length === 0;
}