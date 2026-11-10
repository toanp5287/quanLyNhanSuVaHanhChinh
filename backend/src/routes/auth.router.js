import express from "express";
import { login } from "../controllers/auth/auth.controller.js";
const routerAuth = express.Router();

routerAuth.post("/", login);
export default routerAuth;
