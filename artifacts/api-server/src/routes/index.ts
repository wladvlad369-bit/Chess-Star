import { Router, type IRouter } from "express";
import healthRouter from "./health";
import versionRouter from "./version";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(versionRouter);
router.use(accountRouter);

export default router;
