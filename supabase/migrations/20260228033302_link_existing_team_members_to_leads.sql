/*
  # Link Existing Team Members to Their Team Leads

  ## Changes Made
  
  1. Updates existing team member records
    - Finds team leads that have team members in their agent_data
    - Links team members to their leads by matching screen names
    - Only updates records where team_lead_id is NULL and is_team_lead is false
  
  2. Data Integrity
    - Matches screen_name from team members to children in team lead's agent_data
    - Uses JSONB queries to parse the nested team structure
*/

-- Update team members to link them to their team leads
UPDATE contacts AS team_member
SET team_lead_id = team_lead.id
FROM contacts AS team_lead,
     jsonb_array_elements(
       team_lead.agent_data->'teamDisplayInformation'->'teamLeadInfo'->'children'
     ) AS child
WHERE 
  -- Team lead must be flagged as a team lead
  team_lead.is_team_lead = true
  -- Team member must not already have a team lead
  AND team_member.team_lead_id IS NULL
  -- Team member must not be a team lead themselves
  AND team_member.is_team_lead = false
  -- Match screen names between team member and the child in team lead's data
  AND team_member.screen_name = (child->>'screenName')
  -- Ensure both are in the same campaign
  AND team_lead.campaign_id = team_member.campaign_id
  -- Ensure both belong to the same user
  AND team_lead.user_id = team_member.user_id;