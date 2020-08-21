import Vue from 'vue';
import Router from 'vue-router';

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
            component: Subscription
        },
        {
            path: "/dashboard",
            name: "dashboard",
            component: Dashboard
        },
        {
            path: "/user",
            name: "user",
            component: User
        }
    ]
});

export default router;