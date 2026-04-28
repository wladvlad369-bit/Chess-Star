import { Router, type IRouter } from "express";

const router: IRouter = Router();

const APP_VERSION = "v0.05";

router.get("/version", (_req, res) => {
  res.json({
    latest: APP_VERSION,
    required: APP_VERSION,
  });
});

export default router;
