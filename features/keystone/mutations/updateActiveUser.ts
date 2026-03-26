async function updateActiveUser(root: any, { data }: { data: any }, context: any) {
  const sudoContext = context.sudo();
  const session = context.session;

  if (!session?.itemId) {
    throw new Error("Not authenticated");
  }

  const existingUser = await sudoContext.query.User.findOne({
    where: { id: session.itemId },
    query: "id",
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  return await sudoContext.db.User.updateOne({
    where: { id: session.itemId },
    data,
  });
}

export default updateActiveUser;
