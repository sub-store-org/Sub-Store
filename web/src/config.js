const DEBUG = process.env.NODE_ENV === "development";
export const BACKEND_BASE = DEBUG ? `http://192.168.1.134:3000` : `https://sub.store`;