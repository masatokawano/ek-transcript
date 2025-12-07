export const UPDATE_INTERVIEW = /* GraphQL */ `
  mutation UpdateInterview($input: UpdateInterviewInput!) {
    updateInterview(input: $input) {
      interview_id
      segment
      created_at
      analysis_key
      transcript_key
      video_key
      diarization_key
      total_score
      user_id
    }
  }
`;

export const DELETE_INTERVIEW = /* GraphQL */ `
  mutation DeleteInterview($interview_id: ID!) {
    deleteInterview(interview_id: $interview_id) {
      interview_id
      segment
      created_at
      analysis_key
      transcript_key
      video_key
      diarization_key
      total_score
      user_id
    }
  }
`;
