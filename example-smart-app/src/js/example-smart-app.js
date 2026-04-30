(function(window) {
  window.extractData = function() {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart) {
      if (!smart.hasOwnProperty('patient')) {
        onError();
        return;
      }

      var patientResource = smart.patient;
      var pt = patientResource.read();

      var observations = smart.patient.api.fetchAll({
        type: 'Observation',
        query: {
          code: {
            $or: [
              'http://loinc.org|8302-2',  // Height
              'http://loinc.org|29463-7', // Weight
              'http://loinc.org|39156-5', // BMI
              'http://loinc.org|2085-9',  // HDL
              'http://loinc.org|2089-1',  // LDL
              'http://loinc.org|2093-3',  // Total Cholesterol
              'http://loinc.org|2571-8',  // Triglycerides
              'http://loinc.org|85354-9', // Blood Pressure panel
              'http://loinc.org|8310-5',  // Body temperature
              'http://loinc.org|8867-4',  // Heart rate
              'http://loinc.org|9279-1',  // Respiratory rate
              'http://loinc.org|2708-6',  // SpO2
              'http://loinc.org|3150-0'   // Oxygen flow rate
            ]
          }
        }
      });

      var allergies = smart.patient.api.fetchAll({ type: 'AllergyIntolerance' });
      var conditions = smart.patient.api.fetchAll({ type: 'Condition' });
      var carePlans = smart.patient.api.fetchAll({ type: 'CarePlan' });
      var medications = smart.patient.api.fetchAll({ 
        type: 'MedicationRequest',
        query: {
         patient: smart.patient.id
      }
      });
      var procedures = smart.patient.api.fetchAll({ type: 'Procedure' });
      var reports = smart.patient.api.fetchAll({ type: 'DiagnosticReport' });

      $.when(pt, observations, allergies, conditions, carePlans, medications, procedures, reports).fail(onError);

      $.when(pt, observations, allergies, conditions, carePlans, medications, procedures, reports)
        .done(function(patient, obv, allergyList, conditionList, carePlanList, medicationList, procedureList, reportList) {

          console.log('Patient:', patient);
          console.log('Patient ID:', patient.id);
          console.log('DOB:', patient.birthDate);
          console.log('Observations:', obv);

          var byCodes = smart.byCodes(obv, 'code');
          var p = defaultPatient();

          p.patientId = patient.id || 'N/A';
          p.fname = getFirstName(patient);
          p.lname = getLastName(patient);
          p.gender = capitalize(patient.gender || 'N/A');
          p.birthdate = formatDate(patient.birthDate);

          p.height = getLatestValue(byCodes('8302-2'));
          p.weight = getLatestValue(byCodes('29463-7'));
          p.bmi = getLatestValue(byCodes('39156-5'));
          p.hdl = getLatestValue(byCodes('2085-9'));
          p.ldl = getLatestValue(byCodes('2089-1'));
          p.totalCholesterol = getLatestValue(byCodes('2093-3'));
          p.triglycerides = getLatestValue(byCodes('2571-8'));
          p.temperature = getLatestValue(byCodes('8310-5'));
          p.heartRate = getLatestValue(byCodes('8867-4'));
          p.respiratoryRate = getLatestValue(byCodes('9279-1'));
          p.spo2 = getLatestValue(byCodes('2708-6'));
          p.oxygenFlow = getLatestValue(byCodes('3150-0'));

          p.systolicbp = getBloodPressureValue(byCodes('85354-9'), '8480-6');
          p.diastolicbp = getBloodPressureValue(byCodes('85354-9'), '8462-4');

          p.conditions = getConditions(conditionList);
          p.carePlans = getCarePlans(carePlanList);
          p.allergies = getAllergies(allergyList);
          p.medications = getMedications(medicationList);
          p.procedures = getProcedures(procedureList);
          p.reports = getReports(reportList);

          ret.resolve(p);
        });
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();
  };

  function defaultPatient() {
    return {
      patientId: '',
      fname: '',
      lname: '',
      gender: '',
      birthdate: '',
      height: 'Not available',
      weight: 'Not available',
      bmi: 'Not available',
      hdl: 'Not available',
      ldl: 'Not available',
      totalCholesterol: 'Not available',
      triglycerides: 'Not available',
      temperature: 'Not available',
      heartRate: 'Not available',
      respiratoryRate: 'Not available',
      spo2: 'Not available',
      oxygenFlow: 'Not available',
      systolicbp: 'Not available',
      diastolicbp: 'Not available',
      conditions: '',
      carePlans: '',
      allergies: '',
      medications: '',
      procedures: '',
      reports: ''
    };
  }

  function getFirstName(patient) {
    if (patient.name && patient.name[0] && patient.name[0].given) {
      return patient.name[0].given.join(' ');
    }
    return 'N/A';
  }

  function getLastName(patient) {
    if (patient.name && patient.name[0] && patient.name[0].family) {
      return patient.name[0].family;
    }
    return 'N/A';
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';

    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function capitalize(value) {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getLatestValue(list) {
    if (!list || list.length === 0) {
      return 'Not available';
    }

    list.sort(function(a, b) {
      return new Date(b.effectiveDateTime || b.issued || 0) - new Date(a.effectiveDateTime || a.issued || 0);
    });

    var value = getQuantityValueAndUnit(list[0]);
    return value || 'Not available';
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    if (!BPObservations || BPObservations.length === 0) {
      return 'Not available';
    }

    BPObservations.sort(function(a, b) {
      return new Date(b.effectiveDateTime || 0) - new Date(a.effectiveDateTime || 0);
    });

    for (var i = 0; i < BPObservations.length; i++) {
      var observation = BPObservations[i];

      if (observation.component) {
        for (var j = 0; j < observation.component.length; j++) {
          var component = observation.component[j];

          if (component.code && component.code.coding) {
            for (var k = 0; k < component.code.coding.length; k++) {
              if (component.code.coding[k].code === typeOfPressure && component.valueQuantity) {
                return formatQuantity(component.valueQuantity);
              }
            }
          }
        }
      }
    }

    return 'Not available';
  }

  function getQuantityValueAndUnit(ob) {
    if (ob && ob.valueQuantity && typeof ob.valueQuantity.value !== 'undefined') {
      return formatQuantity(ob.valueQuantity);
    }
    return undefined;
  }

  function formatQuantity(qty) {
    var value = qty.value;
    var unit = qty.unit || qty.code || '';

    if (unit === 'degC') unit = '°C';
    if (unit === 'kg/m2') unit = 'kg/m²';

    return value + (unit ? ' ' + unit : '');
  }

  function getDisplayFromCodeableConcept(cc) {
    if (!cc) return 'N/A';

    if (cc.text) return cc.text;

    if (cc.coding && cc.coding[0]) {
      return cc.coding[0].display || cc.coding[0].code || 'N/A';
    }

    return 'N/A';
  }

  function getConditions(list) {
    if (!list || list.length === 0) {
      return '<li>None</li>';
    }

    var html = '';
    list.forEach(function(c) {
      html += '<li>' + getDisplayFromCodeableConcept(c.code) + '</li>';
    });

    return html;
  }

  function getCarePlans(list) {
    if (!list || list.length === 0) {
      return '<li>None</li>';
    }

    var html = '';
    list.forEach(function(cp) {
      var title = cp.title || getDisplayFromCodeableConcept(cp.category && cp.category[0]);
      html += '<li>' + title + '</li>';
    });

    return html;
  }

  function getAllergies(list) {
    if (!list || list.length === 0) {
      return '<tr><td colspan="3">None</td></tr>';
    }

    var html = '';

    list.forEach(function(a) {
      var name = getDisplayFromCodeableConcept(a.code);
      var status = 'Unknown';
      var reactionText = 'None';

      if (a.clinicalStatus && a.clinicalStatus.coding && a.clinicalStatus.coding[0]) {
        status = capitalize(a.clinicalStatus.coding[0].code);
      }

      if (a.reaction && a.reaction.length > 0) {
        var reactions = [];

        a.reaction.forEach(function(r) {
          if (r.manifestation) {
            r.manifestation.forEach(function(m) {
              var reaction = getDisplayFromCodeableConcept(m);
              if (reaction && reaction !== 'N/A') {
                reactions.push(reaction);
              }
            });
          }
        });

        if (reactions.length > 0) {
          reactionText = reactions.join(', ');
        }
      }

      html +=
        '<tr>' +
          '<td>' + name + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + reactionText + '</td>' +
        '</tr>';
    });

    return html;
  }

  function getMedications(list) {
    if (!list || list.length === 0) {
      return '<li>None</li>';
    }

    var html = '';

    list.forEach(function(m) {
      var medName = 'N/A';

      if (m.medicationCodeableConcept) {
        medName = getDisplayFromCodeableConcept(m.medicationCodeableConcept);
      } else if (m.medicationReference && m.medicationReference.display) {
        medName = m.medicationReference.display;
      }

      html += '<li>' + medName + '</li>';
    });

    return html;
  }

  function getProcedures(list) {
    if (!list || list.length === 0) {
      return '<li>None</li>';
    }

    var html = '';
    list.forEach(function(proc) {
      html += '<li>' + getDisplayFromCodeableConcept(proc.code) + '</li>';
    });

    return html;
  }

  function getReports(list) {
    if (!list || list.length === 0) {
      return '<li>None</li>';
    }

    var html = '';
    list.forEach(function(r) {
      html += '<li>' + getDisplayFromCodeableConcept(r.code) + '</li>';
    });

    return html;
  }

  window.drawVisualization = function(p) {
    $('#holder').show();
    $('#loading').hide();

    $('#patient-title').html(p.lname + ', ' + p.fname);
    $('#patient-id').html(p.patientId);
    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);

    $('#height').html(p.height);
    $('#weight').html(p.weight);
    $('#bmi').html(p.bmi);
    $('#systolicbp').html(p.systolicbp);
    $('#diastolicbp').html(p.diastolicbp);
    $('#hdl').html(p.hdl);
    $('#ldl').html(p.ldl);
    $('#totalCholesterol').html(p.totalCholesterol);
    $('#triglycerides').html(p.triglycerides);
    $('#temperature').html(p.temperature);
    $('#heartRate').html(p.heartRate);
    $('#respiratoryRate').html(p.respiratoryRate);
    $('#spo2').html(p.spo2);
    $('#oxygenFlow').html(p.oxygenFlow);

    $('#condition-list').html(p.conditions);
    $('#careplan-list').html(p.carePlans);
    $('#allergy-table').html(p.allergies);
    $('#medication-list').html(p.medications);
    $('#procedure-list').html(p.procedures);
    $('#report-list').html(p.reports);
  };

})(window);
