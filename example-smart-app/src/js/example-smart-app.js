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
                'http://loinc.org|85354-9', // systolic and diastolic
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

          if (typeof patient.name[0] !== 'undefined') {
            fname = patient.name[0].given.join(' ');
            lname = patient.name[0].family;
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
          p.height = getQuantityValueAndUnit(height[0]);

          if (typeof systolicbp != 'undefined') {
            p.systolicbp = systolicbp;
          }

          if (typeof diastolicbp != 'undefined') {
            p.diastolicbp = diastolicbp;
          }

          if (typeof ldl[0] != 'undefined') {
            p.ldl = getQuantityValueAndUnit(ldl[0]);
          } else {
            p.ldl = 'Not available';
          }

          if (typeof hdl[0] != 'undefined') {
            p.hdl = getQuantityValueAndUnit(hdl[0]);
          }

          if (typeof temperature[0] != 'undefined') {
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
      fname: {value: ''},
      lname: {value: ''},
      gender: {value: ''},
      birthdate: {value: ''},
      height: {value: ''},
      systolicbp: {value: ''},
      diastolicbp: {value: ''},
      ldl: {value: ''},
      hdl: {value: ''},
      temperature: {value: ''},
      allergies: {value: ''}
    };
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];

    BPObservations.forEach(function(observation){
      var BP = observation.component.find(function(component){
        return component.code.coding.find(function(coding) {
          return coding.code == typeOfPressure;
        });
      });

      if (BP) {
        observation.valueQuantity = BP.valueQuantity;
        formattedBPObservations.push(observation);
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
  }

  function getQuantityValueAndUnit(ob) {
    if (typeof ob != 'undefined' &&
        typeof ob.valueQuantity != 'undefined' &&
        typeof ob.valueQuantity.value != 'undefined' &&
        typeof ob.valueQuantity.unit != 'undefined') {
      return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
  }

  function getAllergies(allergyList) {
    var allergyHtml = '';

    allergyList.forEach(function(allergy) {
      var allergyName = '';

      if (allergy.code && allergy.code.text) {
        allergyName = allergy.code.text;
      } else if (allergy.code && allergy.code.coding && allergy.code.coding[0]) {
        allergyName = allergy.code.coding[0].display;
      }

      var reactionText = '';

      if (allergy.reaction) {
        allergy.reaction.forEach(function(reaction) {
          if (reaction.manifestation) {
            reaction.manifestation.forEach(function(manifestation) {
              if (manifestation.text) {
                reactionText += manifestation.text + ' ';
              } else if (manifestation.coding && manifestation.coding[0]) {
                reactionText += manifestation.coding[0].display + ' ';
              }
            });
          }
        });
      }

      allergyHtml += '<tr><td>' + allergyName + '</td><td>' + reactionText + '</td></tr>';
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
    $('#allergies').html(p.allergies);
  };

})(window);
