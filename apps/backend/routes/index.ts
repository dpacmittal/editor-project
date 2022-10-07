import express from 'express';

import notesRouter from './notes';
import syncRouter from './sync';

const router = express.Router();

router.use("/notes", notesRouter);
router.use("/sync", syncRouter);

export default router;
