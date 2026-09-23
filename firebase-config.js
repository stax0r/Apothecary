// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8QXlIWT76AZqttFWzLn4IKRRs3wYAaX8",
  authDomain: "alchemy-shop-dcceb.firebaseapp.com",
  databaseURL: "https://alchemy-shop-dcceb-default-rtdb.firebaseio.com",
  projectId: "alchemy-shop-dcceb",
  storageBucket: "alchemy-shop-dcceb.firebasestorage.app",
  messagingSenderId: "268082568197",
  appId: "1:268082568197:web:31de53d83bece61f0d506c",
  measurementId: "G-H2DY8TMDMN"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);