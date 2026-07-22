import express from 'express';
import { protect } from '../middleware/supabaseAuth.js';
import {
  deleteUserGalleryImage,
  listUserGallery,
} from '../services/userGallery.js';

const router = express.Router();

router.get('/gallery', protect, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required.',
        messageKey: 'api.authRequired',
      });
    }

    const limit = Number(req.query?.limit);
    const items = await listUserGallery(req.user.id, {
      limit: Number.isFinite(limit) ? limit : 48,
    });

    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.delete('/gallery/:id', protect, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required.',
        messageKey: 'api.authRequired',
      });
    }

    await deleteUserGalleryImage(req.user.id, req.params.id);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
