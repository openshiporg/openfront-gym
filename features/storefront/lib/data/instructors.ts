import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";

export type InstructorData = {
  id: string;
  user: { name: string };
  bio: any;
  specialties: string[];
  certifications: string[];
  photo: string | null;
  isActive: boolean;
};

type PublicInstructor = {
  id: string;
  name: string;
  bio?: string | null;
  specialties: string[];
  certifications: string[];
  imagePath?: string | null;
};

function instructorShape(instructor: PublicInstructor): InstructorData {
  return {
    id: instructor.id,
    user: { name: instructor.name },
    bio: instructor.bio ?? null,
    specialties: instructor.specialties,
    certifications: instructor.certifications,
    photo: instructor.imagePath ?? null,
    isActive: true,
  };
}

export async function getInstructors(): Promise<InstructorData[]> {
  const result = await gymClient.request<{ publicGymInstructors: PublicInstructor[] }>(gql`
    query StorefrontInstructors {
      publicGymInstructors(limit: 100) { id name bio specialties certifications imagePath }
    }
  `);
  return result.publicGymInstructors.map(instructorShape);
}

export async function getInstructorById(id: string): Promise<InstructorData | null> {
  const result = await gymClient.request<{ publicGymInstructor: PublicInstructor | null }>(gql`
    query StorefrontInstructor($id: ID!) {
      publicGymInstructor(id: $id) { id name bio specialties certifications imagePath }
    }
  `, { id });
  return result.publicGymInstructor ? instructorShape(result.publicGymInstructor) : null;
}

export async function getInstructorSchedules(instructorId: string) {
  const result = await gymClient.request<{ publicGymSchedules: any[] }>(gql`
    query StorefrontInstructorSchedules($instructorId: ID!) {
      publicGymSchedules(instructorId: $instructorId, limit: 100) {
        id name description dayOfWeek startTime endTime maxCapacity
      }
    }
  `, { instructorId });
  return result.publicGymSchedules;
}
