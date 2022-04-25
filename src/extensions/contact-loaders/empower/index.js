import fetch from "node-fetch";
import { User, Organization, UserOrganization } from "../../../server/models";

export const name = "empower";

export function displayName() {
  return "Empower Project";
}

export function serverAdministratorInstructions() {
  return {
    description: "Load orgs/contacts from Empower",
    setupInstructions:
      "Set up an Auth0 Management API and set the environment variables specified.",
    environmentVariables: [
      "AUTH0_MANAGEMENT_API_CLIENT_ID",
      "AUTH0_MANAGEMENT_API_CLIENT_SECRET",
      "EMPOWER_SHARED_SECRET"
    ]
  };
}

export async function available(organization, user) {
  // / return an object with two keys: result: true/false
  // / these keys indicate if the ingest-contact-loader is usable
  // / Sometimes credentials need to be setup, etc.
  // / A second key expiresSeconds: should be how often this needs to be checked
  // / If this is instantaneous, you can have it be 0 (i.e. always), but if it takes time
  // / to e.g. verify credentials or test server availability,
  // / then it's better to allow the result to be cached

  const result = false; // There is no front-end ingestion for this contact loader
  return {
    result,
    expiresSeconds: 86400
  };
}

export function addServerEndpoints(expressApp) {
  expressApp.post("/integration/empower/create/organization", function(
    req,
    res
  ) {
    if (!authenticateRequest(req.body)) {
      return res.status(401).send({ message: "Invalid shared secret" });
    }
    if (!validateOrganization(req.body)) {
      return res
        .status(400)
        .send({ message: "Organization attributes missing." });
    }
    createOrganization(req.body).then(function(result) {
      return res.send(result);
    });
  });
  expressApp.post("/integration/empower/create/user", function(req, res) {
    if (!authenticateRequest(req.body)) {
      return res.status(401).send({ message: "Invalid shared secret" });
    }
    if (!validateUser(req.body)) {
      return res.status(400).send({ message: "User attributes missing." });
    }
    createUser(req.body).then(function(result) {
      return res.send(result);
    });
  });
}

export async function createOrganization(payload) {
  const org = await Organization.save({
    name: payload.name
  });
  return JSON.stringify(org);
}

export async function createUser(payload) {
  const users = await User.filter({
    email: payload.email
  }).run();
  if (users.length == 0) {
    const resp = await createNewUser(payload);
    return resp;
  } else {
    const resp = await updateUser(payload, users[0].id);
    return resp;
  }
}

export async function updateUser(payload, uid) {
  const user = await User.get(uid)
    .update({
      first_name: payload.first_name,
      last_name: payload.last_name,
      cell: payload.cell,
      is_superadmin: payload.is_superadmin
    })
    .run();
  UserOrganization.save({
    user_id: uid,
    organization_id: payload.organization_id,
    role: payload.role.toUpperCase()
  });
  return JSON.stringify(user);
}

export async function createNewUser(payload) {
  const url = "https://" + process.env.AUTH0_DOMAIN + "/api/v2/users";
  const token = await getAuth0Token();
  const body = JSON.stringify({
    email: payload.email,
    connection: "email"
  });
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json"
  };
  const requestOptions = {
    method: "POST",
    headers: headers,
    body: body,
    redirect: "follow"
  };
  const resp = await fetch(url, requestOptions); // Create auth0 user
  if (resp.status == 201) {
    const responseJson = await resp.json();
    const user_id = responseJson["user_id"];
    const user = await User.save({
      // Create Spoke user
      auth0_id: user_id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      cell: payload.cell,
      email: payload.email,
      is_superadmin: payload.is_superadmin
    });
    UserOrganization.save({
      // Ties user to an organization
      user_id: user.id,
      organization_id: payload.organization_id,
      role: payload.role.toUpperCase()
    });
    return JSON.stringify(user);
  }
  return resp.text();
}

export function authenticateRequest(payload) {
  return payload.empower_shared_secret === process.env.EMPOWER_SHARED_SECRET;
}

export function validateUser(payload) {
  const user_attributes = [
    "email",
    "first_name",
    "last_name",
    "cell",
    "organization_id",
    "role",
    "is_superadmin"
  ];
  return user_attributes.every(key => payload.hasOwnProperty(key));
}

export function validateOrganization(payload) {
  const org_attributes = ["name"];
  return org_attributes.every(key => payload.hasOwnProperty(key));
}

export async function getAuth0Token() {
  const url = "https://" + process.env.AUTH0_DOMAIN + "/oauth/token";
  const audience = "https://" + process.env.AUTH0_DOMAIN + "/api/v2/";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.AUTH0_MANAGEMENT_API_CLIENT_ID,
      client_secret: process.env.AUTH0_MANAGEMENT_API_CLIENT_SECRET,
      audience: audience,
      grant_type: "client_credentials"
    })
  });
  const responseJson = await resp.json();
  const access_token = responseJson["access_token"];
  return access_token;
}

export function getClientChoiceData(organization, campaign, user) {
  /// data to be sent to the admin client to present options to the component or similar
  /// The react-component will be sent this data as a property
  /// return a json object which will be cached for expiresSeconds long
  /// `data` should be a single string -- it can be JSON which you can parse in the client component
  return {
    data: "",
    expiresSeconds: 0
  };
}
