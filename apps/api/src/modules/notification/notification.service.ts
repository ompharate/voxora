import { Notification } from "@shared/models";

class NotificationService {
  async getNotifications(organizationId: string, userId: string, limit = 50) {
    // Fetch org-wide and user-specific notifications
    const notifications = await Notification.find({
      organizationId,
      $or: [{ userId: { $exists: false } }, { userId }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return notifications;
  }

  async markAsRead(organizationId: string, userId: string, notificationId: string) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, organizationId, $or: [{ userId: { $exists: false } }, { userId }] },
      { isRead: true },
      { new: true }
    );
  }

  async markAllAsRead(organizationId: string, userId: string) {
    return Notification.updateMany(
      { organizationId, $or: [{ userId: { $exists: false } }, { userId }], isRead: false },
      { isRead: true }
    );
  }
}

export default new NotificationService();
