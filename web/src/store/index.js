import Vue from 'vue';
import Vuex from 'vuex';
import {axios} from "@/utils";

Vue.use(Vuex);

const store = new Vuex.Store({
    state: {
        title: "Sub-Store",
        isDarkMode: false,
        clipboard: "",

        successMessage: "",
        errorMessage: "",

        subscriptions: {},
        collections: {},
        env: {},

        settings: {}
    },

    mutations: {
        COPY(state, text) {
            state.clipboard = text;
        },
        // UI
        SET_NAV_TITLE(state, title) {
            state.title = title;
        },
        SET_DARK_MODE(state, isDarkMode) {
            state.isDarkMode = isDarkMode
        },

        SET_SUCCESS_MESSAGE(state, msg) {
            state.successMessage = msg;
        },

        SET_ERROR_MESSAGE(state, msg) {
            state.errorMessage = msg;
        },

    },

    actions: {
        // fetch subscriptions
        async FETCH_SUBSCRIPTIONS({state}) {
            return axios.get("/subs").then(resp => {
                const {data} = resp.data;
                state.subscriptions = data;
            });
        },
        // fetch collections
        async FETCH_COLLECTIONS({state}) {
            return axios.get("/collections").then(resp => {
                const {data} = resp.data;
                state.collections = data;
            });
        },
        // fetch env
        async FETCH_ENV({state}) {
            return axios.get("/utils/env").then(resp => {
                state.env = resp.data;
            })
        },
        // update subscriptions
        async UPDATE_SUBSCRIPTION({dispatch}, {name, sub}) {
            return axios.patch(`/sub/${name}`, sub).then(() => {
                dispatch("FETCH_SUBSCRIPTIONS");
                dispatch("FETCH_COLLECTIONS");
            });
        },
        // new subscription
        async NEW_SUBSCRIPTION({dispatch}, sub) {
            return axios.post(`/subs`, sub).then(() => {
                dispatch("FETCH_SUBSCRIPTIONS");
            });
        },
        // delete subscription
        async DELETE_SUBSCRIPTION({dispatch}, name) {
            return axios.delete(`/sub/${name}`).then(() => {
                dispatch("FETCH_SUBSCRIPTIONS");
                dispatch("FETCH_COLLECTIONS");
            });
        },
        // update collection
        async UPDATE_COLLECTION({dispatch}, {name, collection}) {
            return axios.patch(`/collection/${name}`, collection).then(() => {
                dispatch("FETCH_COLLECTIONS");
            });
        },
        // new collection
        async NEW_COLLECTION({dispatch}, collection) {
            return axios.post(`/collections`, collection).then(() => {
                dispatch("FETCH_COLLECTIONS");
            })
        },
        // delete collection
        async DELETE_COLLECTION({dispatch}, name) {
            return axios.delete(`/collection/${name}`).then(() => {
                dispatch("FETCH_COLLECTIONS");
            })
        }
    },

    getters: {}
})

export default store;