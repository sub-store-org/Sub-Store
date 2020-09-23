import Axios from 'axios';
import Vue from 'vue';
import store from "@/store";
import {BACKEND_BASE} from "@/config";

export const axios = Axios.create({
    baseURL: `${BACKEND_BASE}/api`,
    timeout: 10000
});

export const EventBus = new Vue();

export function isEmptyObj(obj) {
    return Object.keys(obj).length === 0;
}

export function showInfo(msg) {
    store.commit("SET_SUCCESS_MESSAGE", msg);
}

export function showError(err) {
    store.commit("SET_ERROR_MESSAGE", err);
}