"use client";

import { generateClient, type GraphQLResult } from "aws-amplify/api";
import type {
  Interview,
  InterviewConnection,
  GetInterviewResponse,
  ListInterviewsResponse,
  ListInterviewsBySegmentResponse,
  UpdateInterviewInput,
  UpdateInterviewResponse,
  DeleteInterviewResponse,
} from "./types";
import { GET_INTERVIEW, LIST_INTERVIEWS, LIST_INTERVIEWS_BY_SEGMENT } from "./queries";
import { UPDATE_INTERVIEW, DELETE_INTERVIEW } from "./mutations";

const client = generateClient();

export async function getInterview(
  interviewId: string
): Promise<Interview | null> {
  const response = await client.graphql({
    query: GET_INTERVIEW,
    variables: { interview_id: interviewId },
  }) as GraphQLResult<GetInterviewResponse>;
  return response.data?.getInterview ?? null;
}

export async function listInterviews(
  limit?: number,
  nextToken?: string
): Promise<InterviewConnection> {
  const response = await client.graphql({
    query: LIST_INTERVIEWS,
    variables: { limit, nextToken },
  }) as GraphQLResult<ListInterviewsResponse>;
  return response.data?.listInterviews ?? { items: [], nextToken: null };
}

export async function listInterviewsBySegment(
  segment: string,
  limit?: number,
  nextToken?: string
): Promise<InterviewConnection> {
  const response = await client.graphql({
    query: LIST_INTERVIEWS_BY_SEGMENT,
    variables: { segment, limit, nextToken },
  }) as GraphQLResult<ListInterviewsBySegmentResponse>;
  return response.data?.listInterviewsBySegment ?? { items: [], nextToken: null };
}

export async function updateInterview(
  input: UpdateInterviewInput
): Promise<Interview> {
  const response = await client.graphql({
    query: UPDATE_INTERVIEW,
    variables: { input },
  }) as GraphQLResult<UpdateInterviewResponse>;
  if (!response.data?.updateInterview) {
    throw new Error("Failed to update interview");
  }
  return response.data.updateInterview;
}

export async function deleteInterview(interviewId: string): Promise<Interview> {
  const response = await client.graphql({
    query: DELETE_INTERVIEW,
    variables: { interview_id: interviewId },
  }) as GraphQLResult<DeleteInterviewResponse>;
  if (!response.data?.deleteInterview) {
    throw new Error("Failed to delete interview");
  }
  return response.data.deleteInterview;
}
