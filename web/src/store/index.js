import Vue from 'vue';
import Vuex from 'vuex';
import {axios} from "@/utils";

Vue.use(Vuex);

const store = new Vuex.Store({
    state: {
        title: "Sub-Store",
        isDarkMode: false,

        successMessage: "",
        errorMessage: "",

        subscriptions: {},
        collections: {},

        settings: {}
    },

    mutations: {
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
        }
    },

    actions: {
        // fetch subscriptions
        async FETCH_SUBSCRIPTIONS({state}) {
            axios.get("/sub").then(resp => {
                const {data} = resp.data;
                state.subscriptions = data;
            });
        },
        // fetch collections
        async FETCH_COLLECTIONS({state}) {
            axios.get("/collection").then(resp => {
                const {data} = resp.data;
                state.collections = data;
            });
        },
        // update subscriptions
        async UPDATE_SUBSCRIPTION({commit, dispatch}, {name, sub}) {
            axios.patch(`/sub/${name}`, sub).then(() => {
                dispatch("FETCH_SUBSCRIPTIONS");
                dispatch("FETCH_COLLECTIONS");
                commit("SET_SUCCESS_MESSAGE", `成功更新订阅${sub.name || name}`);
            }).catch(err => {
                commit("SET_ERROR_MESSAGE", err);
            });
        },
        // new subscription
        async NEW_SUBSCRIPTION() {

        },
        // delete subscription
        async DELETE_SUBSCRIPTION({commit, dispatch}, name) {
            axios.delete(`/sub/${name}`).then(() => {
                dispatch("FETCH_SUBSCRIPTIONS");
                dispatch("FETCH_COLLECTIONS");
                commit("SET_SUCCESS_MESSAGE", `成功删除订阅${name}`);
            }).catch(err => {
                commit("SET_ERROR_MESSAGE", err);
            })
        },
        // update collection
        async UPDATE_COLLECTION() {

        },
        // new collection
        async NEW_COLLECTION() {

        },
        // delete collection
        async DELETE_COLLECTION() {

        }
    },

    getters: {}
})

export default store;