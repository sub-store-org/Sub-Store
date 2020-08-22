import Vue from 'vue';
import Vuex from 'vuex';
import {axios} from "@/utils";

Vue.use(Vuex);

const store = new Vuex.Store({
    state: {
        title: "Sub-Store",
        isDarkMode: false,

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

        // Data
        SET_SUBSCRIPTIONS(state, subscriptions) {
            state.subscriptions = subscriptions;
        },
        SET_COLLECTIONS(state, collections) {
            state.collections = collections;
        }
    },

    actions: {
        // fetch subscriptions
        async FETCH_SUBSCRIPTIONS({commit}) {
            axios.get("/sub").then(resp => {
                const {data} = resp.data;
                commit("SET_SUBSCRIPTIONS", data);
            });
        },
        // fetch collections
        async FETCH_COLLECTIONS({commit}) {
            axios.get("/collection").then(resp => {
                const {data} = resp.data;
                commit("SET_COLLECTIONS", data);
            });
        }
    },

    getters: {}
})

export default store;