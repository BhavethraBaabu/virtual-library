// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; 
import { getAuth } from "firebase/auth";
import { GoogleAuthProvider } from 'firebase/auth';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBnAWO8PixSkVVNr_CPgTrXW7e7IKdIKaw",
  authDomain: "virtuallibrary-75bb4.firebaseapp.com",
  projectId: "virtuallibrary-75bb4",
  storageBucket: "virtuallibrary-75bb4.firebasestorage.app",
  messagingSenderId: "859881742281",
  appId: "1:859881742281:web:a0ce1811971753b3a4d218",
  measurementId: "G-CHWT37NGH4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();