import Vue from 'vue';
import Router from 'vue-router';
import store from "../store";

import Subscription from "@/views/Subscription";
import Dashboard from "@/views/Dashboard";
import User from "@/views/User";
import SubEditor from "@/views/SubEditor";
import Cloud from "@/views/Cloud";

Vue.use(Router);

const router = new Router({
    base: process.env.BASE_URL,
    routes: [
        {
            path: "/",
            name: "subscriptions",
            component: Subscription,
            meta: {title: "订阅", keepAlive: true}
        },
        {
            path: "/dashboard",
            name: "dashboard",
            component: Dashboard,
            meta: {title: "首页", keepAlive: true}
        },
        {
            path: "/cloud",
            name: "artifact",
            component: Cloud,
            meta: {title: "同步", keepAlive: true}
        },
        {
            path: "/user",
            name: "user",
            component: User,
            meta: {title: "我的", keepAlive: true}
        },
        {
            path: "/sub-edit/:name",
            name: "sub-editor",
            component: SubEditor,
            meta: {title: "订阅编辑"}
        },
        {
            path: "/collection-edit/:name",
            name: "collection-edit",
            component: SubEditor,
            props: {isCollection: true},
            meta: {title: "订阅编辑"}
        }
    ]
});

router.beforeEach((to, from, next) => {
    const {meta} = to;
    store.commit("SET_NAV_TITLE", meta.title);
    next();
})

export default router;