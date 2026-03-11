import { keystoneContext } from "@/features/keystone/context";

export type InstructorData = {
  id: string;
  user: {
    name: string;
    email: string;
  };
  bio: any;
  specialties: string[];
  certifications: string[];
  photo: string | null;
  isActive: boolean;
};

export async function getInstructors(): Promise<InstructorData[]> {
  const context = keystoneContext.sudo();

  const instructors = await context.query.Instructor.findMany({
    where: {
      isActive: { equals: true },
    },
    query: `
      id
      user {
        name
        email
      }
      bio { document }
      specialties
      certifications
      photo
      isActive
    `,
  });

  return instructors as InstructorData[];
}

export async function getInstructorById(id: string): Promise<InstructorData | null> {
  const context = keystoneContext.sudo();

  const instructor = await context.query.Instructor.findOne({
    where: { id },
    query: `
      id
      user {
        name
        email
      }
      bio { document }
      specialties
      certifications
      photo
      isActive
    `,
  });

  return instructor as InstructorData | null;
}

export async function getInstructorSchedules(instructorId: string) {
  const context = keystoneContext.sudo();

  const schedules = await context.query.ClassSchedule.findMany({
    where: {
      instructor: { id: { equals: instructorId } },
      isActive: { equals: true },
    },
    query: `
      id
      name
      description
      dayOfWeek
      startTime
      endTime
      maxCapacity
    `,
  });

  return schedules;
}
