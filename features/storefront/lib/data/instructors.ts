import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { PUBLIC_PAGE_SIZE, collectPublicPages, publicCatalogPage } from "./pages";

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
  const { items } = await collectPublicPages(async (skip) => (await gymClient.request<{ publicGymInstructors: PublicInstructor[] }>(gql`
    query StorefrontInstructors($skip: Int, $limit: Int) {
      publicGymInstructors(limit: $limit, skip: $skip) { id name bio specialties certifications imagePath }
    }
  `, { skip, limit: PUBLIC_PAGE_SIZE })).publicGymInstructors);
  return items.map(instructorShape).sort((left, right) => left.user.name.localeCompare(right.user.name));
}

/** One page of published coaches after `after` (keyset continuation). */
export async function getInstructorPage(after?: string) {
  const page = await publicCatalogPage(async (limit) => (await gymClient.request<{ publicGymInstructors: PublicInstructor[] }>(gql`
    query StorefrontInstructorPage($limit: Int, $after: ID) {
      publicGymInstructors(limit: $limit, after: $after) { id name bio specialties certifications imagePath }
    }
  `, { limit, after: after || null })).publicGymInstructors);
  return { items: page.items.map(instructorShape), nextAfter: page.nextAfter };
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
