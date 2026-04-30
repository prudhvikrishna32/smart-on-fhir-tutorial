(function(window){
  window.extractData = function() {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart)  {
      if (smart.hasOwnProperty('patient')) {
        var patient = smart.patient;
        var pt = patient.read();

        var obv = smart.patient.api.fetchAll({
          type: 'Observation',
          query: {
            code: {
              $or: [
                'http://loinc.org|8302-2', // body height
                'http://loinc.org|2085-9', // HDL
                'http://loinc.org|2089-1', // LDL
                'http://loinc.org|85354-9', // blood pressure panel
                'http://loinc.org|8310-5' // temperature
              ]
            }
          }
        });

        var allergy = smart.patient.api.fetchAll({
          type: 'AllergyIntolerance'
        });

        $.when(pt, obv, allergy).fail(onError);

        $.when(pt, obv, allergy).done(function(patient, obv, allergy) {
          console.log(obv);
          console.log(allergy);

          var byCodes = smart.byCodes(obv, 'code');
          var gender = patient.gender;

          var fname = '';
          var lname = '';

          if (patient.name && typeof patient.name[0] !== 'undefined') {
            fname = patient.name[0].given ? patient.name[0].given.join(' ') : '';
            lname = patient.name[0].family || '';
          }

          var height = byCodes('8302-2');
          var systolicbp = getBloodPressureValue(byCodes('85354-9'), '8480-6');
          var diastolicbp = getBloodPressureValue(byCodes('85354-9'), '8462-4');
          var hdl = byCodes('2085-9');
          var ldl = byCodes('2089-1');
          var temperature = byCodes('8310-5');

          var p = defaultPatient();

          p.birthdate = patient.birthDate;
          p.gender = gender;
          p.fname = fname;
          p.lname = lname;

          if (typeof height[0] !== 'undefined') {
            p.height = getQuantityValueAndUnit(height[0]);
          } else {
            p.height = 'Not available';
          }

          if (typeof systolicbp !== 'undefined') {
            p.systolicbp = systolicbp;
          } else {
            p.systolicbp = 'Not available';
          }

          if (typeof diastolicbp !== 'undefined') {
            p.diastolicbp = diastolicbp;
          } else {
            p.diastolicbp = 'Not available';
          }

          if (typeof ldl[0] !== 'undefined') {
            p.ldl = getQuantityValueAndUnit(ldl[0]);
          } else {
            p.ldl = 'Not available';
          }

          if (typeof hdl[0] !== 'undefined') {
            p.hdl = getQuantityValueAndUnit(hdl[0]);
          } else {
            p.hdl = 'Not available';
          }

          if (typeof temperature[0] !== 'undefined') {
            p.temperature = getQuantityValueAndUnit(temperature[0]);
          } else {
            p.temperature = 'Not available';
          }

          p.allergies = getAllergies(allergy);

          ret.resolve(p);
        });
      } else {
        onError();
      }
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();
  };

  function defaultPatient(){
    return {
      fname: '',
      lname: '',
      gender: '',
      birthdate: '',
      height: '',
      systolicbp: '',
      diastolicbp: '',
      ldl: '',
      hdl: '',
      temperature: '',
      allergies: ''
    };
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];

    BPObservations.forEach(function(observation){
      if (observation.component) {
        var BP = observation.component.find(function(component){
          return component.code &&
                 component.code.coding &&
                 component.code.coding.find(function(coding) {
                   return coding.code == typeOfPressure;
                 });
        });

        if (BP && BP.valueQuantity) {
          observation.valueQuantity = BP.valueQuantity;
          formattedBPObservations.push(observation);
        }
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
  }

  function getQuantityValueAndUnit(ob) {
    if (typeof ob !== 'undefined' &&
        typeof ob.valueQuantity !== 'undefined' &&
        typeof ob.valueQuantity.value !== 'undefined') {

      var value = ob.valueQuantity.value;
      var unit = ob.valueQuantity.unit || '';

      return value + (unit ? ' ' + unit : '');
    } else {
      return undefined;
    }
  }

  function getAllergies(allergyList) {
    var allergyHtml = '';

    allergyList.forEach(function(a) {
      var name = 'N/A';
      var status = 'Unknown';
      var reactionText = 'None';

      if (a.code && a.code.text) {
        name = a.code.text;
      } else if (a.code && a.code.coding && a.code.coding[0] && a.code.coding[0].display) {
        name = a.code.coding[0].display;
      }

      if (a.clinicalStatus && a.clinicalStatus.coding && a.clinicalStatus.coding[0]) {
        status = a.clinicalStatus.coding[0].code;

        if (status === 'active') {
          status = 'Active';
        } else if (status === 'resolved') {
          status = 'Resolved';
        }
      }

      if (a.reaction && a.reaction.length > 0) {
        var reactions = [];

        a.reaction.forEach(function(r) {
          if (r.manifestation) {
            r.manifestation.forEach(function(m) {
              if (m.text) {
                reactions.push(m.text.trim());
              } else if (m.coding && m.coding[0] && m.coding[0].display) {
                reactions.push(m.coding[0].display.trim());
              }
            });
          }
        });

        if (reactions.length > 0) {
          reactionText = reactions.join(', ');
        }
      }

      allergyHtml +=
        '<tr>' +
          '<td>' + name + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + reactionText + '</td>' +
        '</tr>';
    });

    return allergyHtml;
  }

  window.drawVisualization = function(p) {
    $('#holder').show();
    $('#loading').hide();

    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);

    $('#height').html(p.height);
    $('#systolicbp').html(p.systolicbp);
    $('#diastolicbp').html(p.diastolicbp);
    $('#ldl').html(p.ldl);
    $('#hdl').html(p.hdl);
    $('#temperature').html(p.temperature);

    $('#allergy-table').html(p.allergies);
  };

})(window);
