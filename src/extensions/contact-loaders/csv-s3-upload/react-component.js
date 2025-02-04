import type from "prop-types";
import React from "react";
import Form from "react-formal";
import axios from "axios";
import * as yup from "yup";
import humps from "humps";
import { StyleSheet, css } from "aphrodite";
import { compose } from "recompose";

import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import ListSubheader from "@material-ui/core/ListSubheader";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";

import GSForm from "../../../components/forms/GSForm";
import GSSubmitButton from "../../../components/forms/GSSubmitButton";
import { parseCSV, gzip, requiredUploadFields } from "../../../lib";
import CampaignFormSectionHeading from "../../../components/CampaignFormSectionHeading";
import { dataTest } from "../../../lib/attributes";
import withMuiTheme from "../../../containers/hoc/withMuiTheme";

export const ensureCamelCaseRequiredHeaders = columnHeader => {
  /*
   * This function changes:
   *  first_name to firstName
   *  last_name to lastName
   *  FirstName to firstName
   *  LastName to lastName
   *
   * It changes no other fields.
   *
   * If other fields that could be either snake_case or camelCase
   * are added to `requiredUploadFields` it will do the same for them.
   * */
  const camelizedColumnHeader = humps.camelize(columnHeader);
  if (
    requiredUploadFields.includes(camelizedColumnHeader) &&
    camelizedColumnHeader !== columnHeader
  ) {
    return camelizedColumnHeader;
  }

  return columnHeader;
};

const innerStyles = {
  button: {
    margin: "24px 5px 24px 0",
    fontSize: "10px"
  },
  nestedItem: {
    fontSize: "12px"
  }
};

export class CampaignContactsFormBase extends React.Component {
  state = {
    uploading: false,
    validationStats: null,
    contactUploadError: null
  };

  styles = StyleSheet.create({
    csvHeader: {
      fontFamily: "Courier",
      backgroundColor: this.props.muiTheme.palette.action.hover,
      backgroundColor: "red",
      padding: 3
    },
    exampleImageInput: {
      cursor: "pointer",
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
      width: "100%",
      opacity: 0
    }
  });

  handleUpload = event => {
    event.preventDefault();
    const file = event.target.files[0];
    this.setState({ uploading: true }, () => {
      parseCSV(
        file,
        ({ contacts, customFields, validationStats, error }) => {
          if (error) {
            this.handleUploadError(error);
          } else if (contacts.length === 0) {
            this.handleUploadError("Upload at least one contact");
          } else if (contacts.length > 0) {
            this.handleUploadSuccess(
              validationStats,
              contacts,
              customFields,
              file
            );
          }
        },
        { headerTransformer: ensureCamelCaseRequiredHeaders }
      );
    });
  };

  handleUploadError(error) {
    this.setState({
      validationStats: null,
      uploading: false,
      contactUploadError: error,
      contacts: null
    });
  }

  handleUploadSuccess(validationStats, contacts, customFields, file) {
    this.setState({
      validationStats,
      customFields,
      uploading: false,
      contactUploadError: null,
      contactsCount: contacts.length
    });
    const contactCollection = {
      name: file.name || null,
      contactsCount: contacts.length,
      customFields,
      contacts
    };
    const self = this;

    const clientData = JSON.parse(this.props.clientChoiceData);

    gzip(JSON.stringify(contactCollection)).then(gzippedData => {
      const data = gzippedData.toString("base64");
      axios.put(clientData.s3Url, data).then(res => {
        self.props.onChange(clientData.s3key);
      });
    });
  }

  renderContactStats() {
    const { customFields, contactsCount } = this.state;

    if (!contactsCount) {
      return "";
    }
    return (
      <List>
        <ListSubheader>Uploaded</ListSubheader>
        <ListItem>
          <ListItemIcon>{this.props.icons.check}</ListItemIcon>
          <ListItemText primary={`${contactsCount} contacts`} />
        </ListItem>
        <ListItem>
          <ListItemIcon>{this.props.icons.check}</ListItemIcon>
          <ListItemText primary={`${customFields.length} custom fields`} />
        </ListItem>
        <List disablePadding>
          {customFields.map((field, index) => (
            <ListItem key={index} primaryText={field}>
              <ListItemIcon>{this.props.icons.check}</ListItemIcon>
              <ListItemText primary={field} />
            </ListItem>
          ))}
        </List>
      </List>
    );
  }

  renderValidationStats() {
    if (!this.state.validationStats) {
      return "";
    }

    const {
      dupeCount,
      missingCellCount,
      invalidCellCount
    } = this.state.validationStats;

    let stats = [
      [dupeCount, "duplicates"],
      [missingCellCount, "rows with missing numbers"],
      [invalidCellCount, "rows with invalid numbers"]
    ];
    stats = stats
      .filter(([count]) => count > 0)
      .map(([count, text]) => `${count} ${text} removed`);
    return (
      <List>
        <Divider />
        {stats.map((stat, index) => (
          <ListItem
            key={index}
            leftIcon={this.props.icons.warning}
            innerDivStyle={innerStyles.nestedItem}
            primaryText={stat}
          />
        ))}
      </List>
    );
  }

  renderUploadButton() {
    const { uploading } = this.state;
    return (
      <div>
        <Button
          variant="contained"
          disabled={uploading}
          onClick={() => this.uploadButton.click()}
        >
          {uploading ? "Uploading..." : "Upload contacts"}
        </Button>
        <input
          id="contact-s3-upload"
          ref={input => input && (this.uploadButton = input)}
          type="file"
          className={css(this.styles.exampleImageInput)}
          onChange={this.handleUpload}
          style={{ display: "none" }}
        />
      </div>
    );
  }

  renderForm() {
    const { contactUploadError } = this.state;
    return (
      <div>
        {!this.props.jobResultMessage ? null : (
          <div>
            <CampaignFormSectionHeading title="Job Outcome" />
            <div>{this.props.jobResultMessage}</div>
          </div>
        )}
        <GSForm
          schema={yup.object({})}
          onSubmit={formValues => {
            this.props.onSubmit();
          }}
        >
          {this.renderUploadButton()}
          {this.renderContactStats()}
          {this.renderValidationStats()}
          {contactUploadError ? (
            <List>
              <ListItem
                id="uploadError"
                primaryText={contactUploadError}
                leftIcon={this.props.icons.error}
              />
            </List>
          ) : null}
          <Form.Submit
            as={GSSubmitButton}
            disabled={this.props.saveDisabled}
            label={this.props.saveLabel}
            {...dataTest("submitContactsCsvUpload")}
          />
        </GSForm>
      </div>
    );
  }

  render() {
    if (this.props.campaignIsStarted) {
      let data;
      try {
        data = JSON.parse(
          (this.props.lastResult && this.props.lastResult.result) || "{}"
        );
      } catch (err) {
        return null;
      }
      return data && data.filename ? (
        <div>Filename: {data.filename}</div>
      ) : null;
    }

    let subtitle = (
      <span>
        Your upload file should be in CSV format with column headings in the
        first row. You must include{" "}
        <span className={css(this.styles.csvHeader)}>firstName</span>, (or{" "}
        <span className={css(this.styles.csvHeader)}>first_name</span>),
        <span className={css(this.styles.csvHeader)}>lastName</span>
        (or <span className={css(this.styles.csvHeader)}>last_name</span>), and
        <span className={css(this.styles.csvHeader)}>cell</span> columns. If you
        include a <span className={css(this.styles.csvHeader)}>zip</span>{" "}
        column, we'll use the zip to guess the contact's timezone for enforcing
        texting hours. An optional column to map the contact to a CRM is{" "}
        <span className={css(this.styles.csvHeader)}>external_id</span>
        Any additional columns in your file will be available as custom fields
        to use in your texting scripts.
      </span>
    );

    return (
      <div>
        {subtitle}
        {this.renderForm()}
      </div>
    );
  }
}

CampaignContactsFormBase.propTypes = {
  onChange: type.func,
  onSubmit: type.func,
  campaignIsStarted: type.bool,

  icons: type.object,

  saveDisabled: type.bool,
  saveLabel: type.string,

  clientChoiceData: type.string,
  lastResult: type.object,
  jobResultMessage: type.string
};

const CampaignContactsForm = compose(withMuiTheme)(CampaignContactsFormBase);

CampaignContactsForm.prototype.renderAfterStart = true;

export { CampaignContactsForm };
