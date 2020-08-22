import Vue from 'vue';
import Router from 'vue-router';
import store from "../store";

import Subscription from "@/views/Subscription";
import Dashboard from "@/views/Dashboard";
import User from "@/views/User";

Vue.use(Router);

const router = new Router({
    mode: "history",
    base: process.env.BASE_URL,
    routes: [
        {
            path: "/",
            name: "subscriptions",
            component: Subscription,
            meta: {title: "订阅"}
        },
        {
            path: "/dashboard",
            name: "dashboard",
            component: Dashboard,
            meta: {title: "首页"}
        },
        {
            path: "/user",
            name: "user",
            component: User,
            meta: {title: "我的"}
        }
    ]
});

router.beforeEach((to, from, next) => {
    const {meta} = to;
    document.title = to.meta.title
    store.commit("SET_NAV_TITLE", meta.title);
    next();
})

export default router;